declare global {
  namespace App {
    interface Locals {
      sessionToken: string | null;
      csrfToken: string;
    }
  }
}

export {};
