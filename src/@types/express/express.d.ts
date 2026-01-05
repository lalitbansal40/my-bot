import "express";

declare global {
  namespace Express {
    interface User {
      user_id: string;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
