import { EdgeRuntime } from 'edge-runtime'
import {
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import s3 from '@/s3'
import prisma from '@/prisma'
import { FastifyRequest } from 'fastify'
import { getClonableBodyStream } from 'edge-runtime/dist/server/body-streams'
import { IncomingMessage } from 'http'
import { createClient } from 'redis'
import { KVNamespace } from '@miniflare/kv'
import { MemoryStorage } from '@miniflare/storage-memory'

export type Deployment = {
  assets: Array<{ name: string }>
  name: string
  runtime: EdgeRuntime
}

const deployments = new Map<string, Deployment>()

const streamToString = (stream: Readable) =>
  new Promise<string>((resolve, reject) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

const createRuntime = (code: string, files: KVNamespace) => {
  return new EdgeRuntime({
    initialCode: code,
    extend: context => {
      if (process.env.REDIS_URL) {
        const redis = createClient({ url: process.env.REDIS_URL })
        redis.on('error', (err) => console.log('Redis Client Error', err))

        redis.connect()

        context.Redis = redis
      }
      context.__STATIC_CONTENT = files
      context.__STATIC_CONTENT_MANIFEST = {}
      return context
    },
  })
}

export async function initializeFunctions() {
  const functions = await prisma.function.findMany({
    select: {
      assets: true,
      name: true,
      domain: true,
    },
  })

  for (const func of functions) {
    const content = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: `${func.name}.js`,
      }),
    )

    const code = await streamToString(content.Body as Readable)

    const ns = new KVNamespace(new MemoryStorage())
    await ns.put('key', 'value')

    const assets = await s3.send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET,
        Prefix: `${func.name}/`,
      }),
    )

    for (const asset of assets.Contents || []) {
      const content = await s3.send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: asset.Key,
        }),
      )

      const assetContent = await streamToString(content.Body as Readable)
      ns.put(asset.Key!.replace(`${func.name}/`, ''), assetContent)
    }

    deployments.set(func.domain, {
      name: func.name,
      assets: func.assets,
      runtime: createRuntime(code, ns),
    })
  }
}

export function teardownFunction(host: string) {
  deployments.delete(host)
}

export async function deployFunction(id: string) {
  const func = await prisma.function.findFirst({
    where: { id },
    select: {
      assets: true,
      name: true,
      domain: true,
    },
  })

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

  const ns = new KVNamespace(new MemoryStorage())
  await ns.put('key', 'value')

  const assets = await s3.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: `${func.name}/`,
    }),
  )

  for (const asset of assets.Contents || []) {
    const content = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: asset.Key,
      }),
    )

    const assetContent = await streamToString(content.Body as Readable)
    ns.put(asset.Key!.replace(`${func.name}/`, ''), assetContent)
  }

  const deployment: Deployment = {
    name: func.name,
    assets: func.assets,
    runtime: createRuntime(code, ns),
  }
  deployments.set(func.domain, deployment)
}

export const getDeployment = (req: FastifyRequest) => {
  const host = req.headers.host || ''

  const deployment = deployments.get(host)
  if (!deployment) {
    return false
  }

  return deployment
}

export async function dispatchFetch(req: FastifyRequest) {
  const host = req.headers.host || ''
  const deployment = getDeployment(req)
  if (!deployment) {
    return false
  }


  const body =
    req.method !== 'GET' && req.method !== 'HEAD'
      ? getClonableBodyStream(req.raw, deployment.runtime.context.TransformStream)
      : undefined

  return await deployment.runtime.dispatchFetch(`${req.protocol}://${host}${req.url}`, {
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
