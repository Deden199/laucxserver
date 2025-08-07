import test from 'node:test'
import assert from 'node:assert/strict'

const { prisma } = require('../src/core/prisma')
const oyModule = require('../src/service/oyClient')

let balance = 100

;(prisma as any).clientUser = {
  findUnique: async () => ({ partnerClientId: 'pc1', totpEnabled: false })
}

;(prisma as any).setting = {
  findUnique: async () => ({ value: null })
}

;(prisma as any).sub_merchant = {
  findUnique: async () => ({ credentials: { merchantId: 'm', secretKey: 's' }, provider: 'oy' })
}

;(prisma as any).withdrawRequest = {
  update: async () => {}
}

;(prisma as any).$transaction = async (fn: any) => {
  return fn({
    partnerClient: {
      findUniqueOrThrow: async () => ({ withdrawFeePercent: 0, withdrawFeeFlat: 0 }),
      updateMany: async ({ where, data }: any) => {
        const dec = data.balance.decrement
        if (balance >= dec) {
          balance -= dec
          return { count: 1 }
        }
        return { count: 0 }
      }
    },
    withdrawRequest: {
      create: async ({ data }: any) => ({ id: 'wr', ...data })
    }
  })
}

;(oyModule as any).OyClient = class {
  async disburse() {
    return { status: { code: '101' }, trx_id: 'trx' }
  }
}

const { requestWithdraw } = require('../src/controller/withdrawals.controller')

function createReq() {
  return {
    body: {
      subMerchantId: 'sub1',
      sourceProvider: 'oy',
      account_number: '123',
      bank_code: '001',
      account_name: 'Acc',
      bank_name: 'Bank',
      amount: 60
    },
    clientUserId: 'user1',
    isParent: false
  }
}

function createRes() {
  const res: any = {}
  res.statusCode = 200
  res.body = undefined
  res.status = (code: number) => { res.statusCode = code; return res }
  res.json = (data: any) => { res.body = data; return res }
  return res
}

test('concurrent withdrawals do not allow negative balance', async () => {
  balance = 100
  const r1 = createRes()
  const r2 = createRes()
  await Promise.all([
    requestWithdraw(createReq() as any, r1),
    requestWithdraw(createReq() as any, r2)
  ])
  const statuses = [r1.statusCode, r2.statusCode].sort()
  assert.deepEqual(statuses, [201, 400])
  const failed = r1.statusCode === 400 ? r1 : r2
  assert.equal(failed.body.error, 'Saldo tidak mencukupi')
  assert.equal(balance, 40)
})
