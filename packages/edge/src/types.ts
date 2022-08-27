export type APIStatus = { success: boolean }

export interface Traefik {
  http: {
    middlewares: {
      'redirect-to-non-www': {
        redirectregex: { regex: string; replacement: string }
      };
      'redirect-to-www': {
        redirectregex: { regex: string; replacement: string }
      };
      'redirect-to-https': {
        redirectscheme: { scheme: string }
      };
      'redirect-to-http':
        {
          redirectscheme: { scheme: string }
        }
    };
    services: Record<string, any>
    routers: Record<string, any>
  }
}
