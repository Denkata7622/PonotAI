declare module "@prisma/client" {
  export class PrismaClient {
    [key: string]: any;
    constructor(options?: any);
    $queryRaw: any;
    $transaction: any;
    $disconnect: any;
  }
}
