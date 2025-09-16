import { Request } from 'express';

export interface CorrelationIdContext {
  correlationId: string;
}

export type RequestWithCorrelationId = Request & {
  correlationId: string;
};
