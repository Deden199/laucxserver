// src/routes/client.ts
import express, { Router } from 'express'
import { requireClientAuth }        from '../middleware/clientAuth'
import { getClientDashboard }       from '../controller/clientDashboard.controller'
import axios from 'axios'
import { config } from '../config'

const r = Router()

// Protect all below
r.use(requireClientAuth)

// Dashboard
r.get('/dashboard', getClientDashboard)

// Withdrawal endpoints via withdrawal service
const withdrawalBase = config.api.withdrawalServiceUrl

r.post('/withdrawals/validate-account', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals/validate-account`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.post('/withdrawals', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.get('/withdrawals', async (req, res) => {
  try {
    const { data } = await axios.get(`${withdrawalBase}/withdrawals`, {
      params: req.query,
      headers: { Authorization: req.header('Authorization') ?? '' },
    })
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

r.post('/withdrawals/:id/retry', express.json(), async (req, res) => {
  try {
    const { data } = await axios.post(
      `${withdrawalBase}/withdrawals/${req.params.id}/retry`,
      req.body,
      { headers: { Authorization: req.header('Authorization') ?? '' } }
    )
    res.json(data)
  } catch (err: any) {
    if (err.response) {
      res.status(err.response.status).json(err.response.data)
    } else {
      res.status(500).json({ error: 'Withdrawal service error' })
    }
  }
})

export default r
