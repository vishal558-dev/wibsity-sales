import type { AiInterpretation, AuditEvidence } from "@/types/audit";
import { mockAiInterpreter } from "./mock";

export interface AiInterpreter {
  interpret(evidence: AuditEvidence): Promise<AiInterpretation>;
}

export function getAiInterpreter(): AiInterpreter {
  const providerName = process.env.AI_INTERPRETER_PROVIDER ?? "mock";
  if (providerName === "mock") return mockAiInterpreter;
  throw new Error(`AI interpreter provider "${providerName}" is not implemented yet. Only "mock" is available.`);
}
