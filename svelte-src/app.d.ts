declare global {
  namespace App {
    interface Locals {
      sessionToken: string | null;
      sessionFromHeader: boolean;
      csrfToken: string;
      user?: any;
    }
  }
}

export {};
