export interface CorrelationIdContext {
  correlationId: string;
}

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}
