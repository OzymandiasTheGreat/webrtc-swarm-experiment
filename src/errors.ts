export enum ErrorCode {
  AUTHENTICATION_FAILED = 256
}

export class AuthenticationFailed extends Error {
  code = ErrorCode.AUTHENTICATION_FAILED

  constructor() {
    super("Authentication Failed")
  }
}
