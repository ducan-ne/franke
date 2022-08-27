import { StatusCode } from 'hono/utils/http-status'

declare module 'hono/dist/context' {
  interface Context {
    // html: (html: JSX.Element, status?: StatusCode, headers?: Headers) => Response
  }
}
