import Module from 'module'

process.env.JWT_SECRET = 'test'

const originalRequire = Module.prototype.require
Module.prototype.require = function (request: string) {
  if (request === '@prisma/client') {
    return {
      PrismaClient: class {},
      DisbursementStatus: {
        PENDING: 'PENDING',
        COMPLETED: 'COMPLETED',
        FAILED: 'FAILED'
      }
    }
  }
  return originalRequire.apply(this, arguments as any)
}
