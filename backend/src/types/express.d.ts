declare namespace Express {
  interface Request {
    userId?: string;
    userRole?: "user" | "admin";
  }
}
