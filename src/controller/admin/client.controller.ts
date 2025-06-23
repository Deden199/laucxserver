// src/controllers/admin/client.controller.ts
import { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// 1) List semua API-Clients
export const getAllClients = async (_: Request, res: Response) => {
  const clients = await prisma.partnerClient.findMany({
    select: { id: true, name: true, apiKey: true, apiSecret: true, isActive: true }
  })
  res.json(clients)
}

// 2) Create API-Client baru + default ClientUser
export const createClient = async (req: Request, res: Response) => {
  const name  = (req.body.name  as string)?.trim()
  const email = (req.body.email as string)?.trim()
  if (!name || !email) {
    return res.status(400).json({ error: 'Name dan email wajib diisi' })
  }

  // 2a) buat PartnerClient
  const apiKey    = crypto.randomUUID()
  const apiSecret = crypto.randomUUID()
  const client    = await prisma.partnerClient.create({
    data: { name, apiKey, apiSecret, isActive: true }
  })

  // 2b) buat ClientUser dengan default password "123456"
  const defaultPassword = '123456'
  const hash = await bcrypt.hash(defaultPassword, 10)
  const user = await prisma.clientUser.create({
    data: {
      partnerClientId: client.id,
      email,
      password: hash,
      role: 'PARTNER_CLIENT'
    }
  })

  // 2c) kembalikan data client + kredensial default
  res.status(201).json({
    client,
    defaultUser: {
      email: user.email,
      password: defaultPassword
    }
  })
}

// 3) Get single client by ID
export const getClientById = async (req: Request, res: Response) => {
  const { clientId } = req.params
  const client = await prisma.partnerClient.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, apiKey: true, apiSecret: true, isActive: true }
  })
  if (!client) return res.status(404).json({ error: 'Client not found' })
  res.json(client)
}

// 4) List semua PG-providers
export const listProviders = async (_: Request, res: Response) => {
  const providers = await prisma.pGProvider.findMany({
    select: { id: true, name: true, credentials: true }
  })
  res.json(providers)
}

// 5) List koneksi PG untuk satu client
export const listClientPG = async (req: Request, res: Response) => {
  const { clientId } = req.params
  const conns = await prisma.clientPG.findMany({
    where: { clientId },
    select: { id: true, clientId: true, pgProviderId: true, clientFee: true, activeDays: true }
  })
  res.json(conns)
}

// 6) Upsert koneksi PG (create or update)
export const createClientPG = async (req: Request, res: Response) => {
  const { clientId }             = req.params
  const { pgProviderId, clientFee, activeDays } = req.body
  if (!pgProviderId || clientFee == null || !Array.isArray(activeDays)) {
    return res.status(400).json({ error: 'pgProviderId, clientFee & activeDays are required' })
  }
  const item = await prisma.clientPG.upsert({
    where: { clientId_pgProviderId: { clientId, pgProviderId } },
    update: { clientFee, activeDays },
    create: { clientId, pgProviderId, clientFee, activeDays }
  })
  res.json(item)
}

// 7) Update koneksi PG by ID
export const updateClientPG = async (req: Request, res: Response) => {
  const { id } = req.params
  const { clientFee, activeDays } = req.body
  if (clientFee == null || !Array.isArray(activeDays)) {
    return res.status(400).json({ error: 'clientFee & activeDays are required' })
  }
  const item = await prisma.clientPG.update({
    where: { id },
    data: { clientFee, activeDays }
  })
  res.json(item)
}

// 8) Delete koneksi PG
export const deleteClientPG = async (_: Request, res: Response) => {
  const { id } = res.locals.params as any
  await prisma.clientPG.delete({ where: { id } })
  res.status(204).end()
}
