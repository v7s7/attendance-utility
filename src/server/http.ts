/** An error the API returns to the browser as { error: code } with an HTTP status. */
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const notFound = (what = "not_found") => new HttpError(404, what);
