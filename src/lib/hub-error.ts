// Errors with a text/plain body come from the hub and are safe to show;
// anything else came from a proxy or CDN in front of it.
export class HubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
