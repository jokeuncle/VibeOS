"""Telemetry setup for VibeOS agents using OpenTelemetry.

Gracefully degrades when OTel packages are not installed.

Usage in agent startup::

    from vibeos_agent.telemetry import init_telemetry
    init_telemetry("architecture-agent")
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_initialized = False


def init_telemetry(service_name: str) -> bool:
    """Initialize OpenTelemetry tracing and metrics exporters.

    Returns True if OTel was successfully configured, False otherwise.
    """
    global _initialized
    if _initialized:
        return True

    try:
        from opentelemetry import trace, metrics
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.resources import Resource
    except ImportError:
        logger.debug("opentelemetry SDK not installed; telemetry disabled")
        return False

    resource = Resource.create({"service.name": service_name})
    tracer_provider = TracerProvider(resource=resource)

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

            exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
            tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info("OTLP trace exporter configured: %s", otlp_endpoint)
        except ImportError:
            logger.debug("OTLP exporter not available; traces to console only")

    trace.set_tracer_provider(tracer_provider)

    meter_provider = MeterProvider(resource=resource)
    metrics.set_meter_provider(meter_provider)

    _initialized = True
    logger.info("OpenTelemetry initialized for %s", service_name)
    return True


def get_tracer(name: str = "vibeos.agent") -> Any:
    """Get a tracer, returning a no-op if OTel is not available."""
    try:
        from opentelemetry import trace
        return trace.get_tracer(name)
    except ImportError:
        return _NoopTracer()


def get_meter(name: str = "vibeos.agent") -> Any:
    """Get a meter, returning a no-op if OTel is not available."""
    try:
        from opentelemetry import metrics
        return metrics.get_meter(name)
    except ImportError:
        return _NoopMeter()


class _NoopSpan:
    def set_attribute(self, *a, **kw): pass
    def set_status(self, *a, **kw): pass
    def record_exception(self, *a, **kw): pass
    def end(self, *a, **kw): pass
    def __enter__(self): return self
    def __exit__(self, *a): pass


class _NoopTracer:
    def start_span(self, *a, **kw): return _NoopSpan()
    def start_as_current_span(self, *a, **kw): return _NoopSpan()


class _NoopMeter:
    def create_counter(self, *a, **kw): return _NoopInstrument()
    def create_histogram(self, *a, **kw): return _NoopInstrument()
    def create_up_down_counter(self, *a, **kw): return _NoopInstrument()


class _NoopInstrument:
    def add(self, *a, **kw): pass
    def record(self, *a, **kw): pass
