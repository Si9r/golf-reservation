// 오류 코드 (상세설계 v1.3 'API' 오류 코드). API는 코드와 메시지 ID를 함께 돌려주고 화면은 메시지 ID로 문구 표시
export const ERRORS = {
  "E-VALID": { http: 400, msg: "M-160" },
  "E-AREA": { http: 400, msg: "M-141" },
  "E-AUTH": { http: 401, msg: "M-151" },
  "E-PAY": { http: 402, msg: "M-173" },
  "E-AMOUNT": { http: 402, msg: "M-175" },
  "E-FORBID": { http: 403, msg: "M-191" },
  "E-NOTFOUND": { http: 404, msg: "M-190" },
  "E-SEAT": { http: 409, msg: "M-120" },
  "E-DUE": { http: 409, msg: "M-209" },
  "E-CLOSED": { http: 409, msg: "M-153" },
  "E-HOLD": { http: 410, msg: "M-171" },
  "E-SOLDOUT": { http: 409, msg: "M-174" },
  "E-STATE": { http: 409, msg: "M-900" },
  "E-SERVER": { http: 500, msg: "M-900" },
} as const;
export type ErrorCode = keyof typeof ERRORS;
export interface ApiErrorBody {
  error: ErrorCode;
  message: string; // 메시지 ID (M-xxx)
  fields?: { field: string; rule: string }[]; // E-VALID 칸별 오류 (V-xx)
}
