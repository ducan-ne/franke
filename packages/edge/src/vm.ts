import { EdgeRuntime } from 'edge-runtime'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import s3 from '@/s3'
import prisma from '@/prisma'
import { FastifyRequest } from 'fastify'
import { getClonableBodyStream } from 'edge-runtime/dist/server/body-streams'
import { IncomingMessage } from 'http'
import { createClient } from 'redis'

const vms = new Map<string, EdgeRuntime>()

const streamToString = (stream: Readable) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

const createRuntime = (code: string) => {
  return new EdgeRuntime({
    initialCode: code,
    extend: context => {
      context.Redis = createClient({ url: process.env.REDIS_URL })
      return context
    },
  })
}

export async function initializeFunctions() {
  const functions = await prisma.function.findMany()

  for (const func of functions) {
    const content = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `${func.name}.js`,
      }),
    )

    const code = await streamToString(content.Body as Readable)

    vms.set(func.domain, createRuntime(code))
  }
}

export function teardownFunction(host: string) {
  vms.delete(host)
}

export async function deployFunction(id: string) {
  const func = await prisma.function.findFirst({ where: { id } })

  if (!func) {
    return
  }

  const content = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `${func.name}.js`,
    }),
  )

  const code = await streamToString(content.Body as Readable)

  vms.set(func.domain, createRuntime(code))
}

export async function dispatchFetch(req: FastifyRequest) {
  const host = req.headers.host || ''

  const runtime = vms.get(host)
  if (!runtime) {
    return false
  }


  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? getClonableBodyStream(req.raw, runtime.context.TransformStream)
      : undefined

  return runtime.dispatchFetch(`${req.protocol}://${host}${req.url}`, {
    headers: toRequestInitHeaders(req.raw),
    method: req.method,
    body: body?.cloneBodyStream(),
  }) || false
}

function toRequestInitHeaders(req: IncomingMessage): RequestInit['headers'] {
  return Object.keys(req.headers).map((key) => {
    const value = req.headers[key]
    return [key, Array.isArray(value) ? value.join(', ') : value ?? '']
  })
}
