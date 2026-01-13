import { spawn } from "child_process";
import path from "path";
import { IEventBus, ILogger } from "../events/types";

export interface ExecutionOptions {
  timeoutMs?: number;
  memoryMb?: number;
  cpus?: number;
  env?: Record<string, string | number | undefined>;
  /** Optional docker image override. Defaults to agentId when not provided. */
  image?: string;
}

export interface ExecutionResult {
  success: boolean;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

const EVENTS = {
  EXECUTION_STARTED: "agent.execution.started",
  EXECUTION_COMPLETED: "agent.execution.completed",
  EXECUTION_FAILED: "agent.execution.failed",
  EXECUTION_TIMEOUT: "agent.execution.timeout",
  EXECUTION_CLEANED: "agent.execution.cleaned",
} as const;

export class AgentExecutionService {
  private readonly defaultTimeoutMs = 5 * 60 * 1000; // 5 minutes
  private readonly defaultMemoryMb = 1024; // 1 GiB
  private readonly defaultCpus = 1;

  constructor(
    private readonly eventBus?: IEventBus,
    private readonly logger?: ILogger,
    private readonly dockerBinary: string = "docker"
  ) {}

  async executeAgent(
    agentId: string,
    bountyId: string,
    workspaceDir: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const resolvedWorkspace = path.resolve(workspaceDir);
    const containerName = this.buildContainerName(agentId, bountyId);
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const memoryMb = options.memoryMb ?? this.defaultMemoryMb;
    const cpus = options.cpus ?? this.defaultCpus;
    const envVars = options.env ?? {};
    const image = options.image ?? agentId;

    const args = this.buildDockerArgs({
      containerName,
      agentId,
      image,
      memoryMb,
      cpus,
      workspaceDir: resolvedWorkspace,
      env: envVars,
    });

    this.logger?.info?.("Starting agent container", {
      agentId,
      bountyId,
      containerName,
      args,
      timeoutMs,
      memoryMb,
      cpus,
    });
    this.publish(EVENTS.EXECUTION_STARTED, {
      agentId,
      bountyId,
      containerName,
      timeoutMs,
      memoryMb,
      cpus,
    });

    const start = Date.now();
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    return new Promise<ExecutionResult>((resolve, reject) => {
      const proc = spawn(this.dockerBinary, args, {
        env: {
          ...process.env,
          AGENT_ID: agentId,
          BOUNTY_ID: bountyId,
          AGENT_IMAGE: image,
          ...this.stringifyEnv(envVars),
        },
      });

      proc.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      proc.on("error", (error) => {
        clearTimeout(timeoutHandle);
        this.logger?.error?.("Failed to start agent container", { error, agentId, bountyId });
        this.publish(EVENTS.EXECUTION_FAILED, {
          agentId,
          bountyId,
          containerName,
          error: String(error),
        });
        reject(error);
      });

      proc.on("close", async (code) => {
        clearTimeout(timeoutHandle);
        const executionTimeMs = Date.now() - start;
        const success = !timedOut && code === 0;

        if (timedOut) {
          this.logger?.warn?.("Agent container timed out", {
            agentId,
            bountyId,
            containerName,
            timeoutMs,
          });
        } else if (success) {
          this.logger?.info?.("Agent container completed", { agentId, bountyId, exitCode: code });
          this.publish(EVENTS.EXECUTION_COMPLETED, {
            agentId,
            bountyId,
            containerName,
            exitCode: code,
            executionTimeMs,
          });
        } else {
          this.logger?.warn?.("Agent container exited with non-zero code", {
            agentId,
            bountyId,
            exitCode: code,
          });
          this.publish(EVENTS.EXECUTION_FAILED, {
            agentId,
            bountyId,
            containerName,
            exitCode: code,
            stderr,
          });
        }

        await this.cleanupContainer(containerName);

        resolve({
          success,
          exitCode: code,
          stdout,
          stderr,
          executionTimeMs,
        });
      });

      const timeoutHandle = setTimeout(async () => {
        timedOut = true;
        this.publish(EVENTS.EXECUTION_TIMEOUT, {
          agentId,
          bountyId,
          containerName,
          timeoutMs,
        });
        await this.killContainer(containerName).catch((error) => {
          this.logger?.warn?.("Failed to kill timed-out container", { containerName, error });
        });
      }, timeoutMs);
    });
  }

  async killContainer(containerName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const killer = spawn(this.dockerBinary, ["rm", "-f", containerName]);
      let stderr = "";

      killer.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      killer.on("close", (code) => {
        if (code === 0) {
          this.logger?.info?.("Container killed and removed", { containerName });
          this.publish(EVENTS.EXECUTION_CLEANED, { containerName });
          resolve();
        } else {
          const error = new Error(`Failed to kill container ${containerName}: ${stderr.trim()}`);
          this.logger?.error?.(error.message);
          reject(error);
        }
      });

      killer.on("error", (error) => {
        this.logger?.error?.("Failed to spawn docker rm", { error });
        reject(error);
      });
    });
  }

  private async cleanupContainer(containerName: string): Promise<void> {
    try {
      await this.killContainer(containerName);
    } catch (error) {
      // Container may already be removed; log and continue
      this.logger?.debug?.("Cleanup skipped or failed", { containerName, error });
    }
  }

  private buildDockerArgs(params: {
    containerName: string;
    agentId: string;
    image: string;
    memoryMb: number;
    cpus: number;
    workspaceDir: string;
    env: Record<string, unknown>;
  }): string[] {
    const { containerName, agentId, image, memoryMb, cpus, workspaceDir, env } = params;

    const args = [
      "run",
      "--rm",
      "--name",
      containerName,
      "--memory",
      `${memoryMb}m`,
      "--cpus",
      cpus.toString(),
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=100",
      "--tmpfs=/tmp:rw",
      "--network=none",
      "-v",
      `${workspaceDir}:/workspace:ro`,
      "-w",
      "/workspace",
    ];

    Object.entries(env).forEach(([key, value]) => {
      if (value === undefined) return;
      args.push("-e", `${key}=${value}`);
    });

    args.push(image);

    return args;
  }

  private buildContainerName(agentId: string, bountyId: string): string {
    const slug = `${agentId}-${bountyId}`
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .slice(0, 60);
    const unique = Date.now().toString(36);
    return `${slug}-${unique}`;
  }

  private stringifyEnv(env: Record<string, string | number | undefined>): Record<string, string> {
    return Object.entries(env).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = String(value);
      }
      return acc;
    }, {});
  }

  private publish(type: string, data: Record<string, unknown>): void {
    if (!this.eventBus) return;
    void this.eventBus.publish({
      type,
      timestamp: new Date(),
      data,
    });
  }
}

export default AgentExecutionService;
