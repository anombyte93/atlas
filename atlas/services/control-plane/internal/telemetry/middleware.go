// middleware.go - HTTP tracing middleware
package telemetry

import (
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
	"net/http"
)

func TraceMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tracer := otel.Tracer("http")
		ctx, span := tracer.Start(r.Context(), r.Method+" "+r.URL.Path)

		span.SetAttributes(
			attribute.String("http.method", r.Method),
			attribute.String("http.url", r.URL.String()), // FIXED: was Stringstring()
		)

		r = r.WithContext(ctx)
		next.ServeHTTP(w, r)

		span.End()
	})
}
