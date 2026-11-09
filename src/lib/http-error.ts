// Shared by HTTP routes and the standalone scheduled Worker.
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
