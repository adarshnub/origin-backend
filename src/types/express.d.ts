declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        sessionId: string;
        email: string;
        displayName: string;
        csrfHash: string;
        isGlobalAdmin: boolean;
      };
    }
  }
}

export {};
