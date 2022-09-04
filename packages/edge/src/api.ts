import Fastify from 'fastify'
import s3 from '@/s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import prisma from '@/prisma'
import {
  deployFunction,
  dispatchFetch,
  teardownFunction,
} from '@/vm'
import { NodeHeaders } from 'edge-runtime/dist/types'
import { Traefik } from '@/types'
import axios from 'axios'
import path from 'path'

const app = Fastify({})

app.addContentTypeParser('application/json', { parseAs: 'string' }, function(req, body, done) {
  try {
    var json = JSON.parse(body as string)
    done(null, json)
  } catch (err: any) {
    err.statusCode = 400
    done(err, undefined)
  }
})

app.register((api, opts, next) => {

  api.addHook('onRequest', function(request, reply, done) {
    if (!request.headers.token || request.headers.token !== process.env.TOKEN) {
      reply.status(403)
      return reply.send({ unauthorized: true })
    }

    done()
  })

  api.post<{
    Body: { name: string, code: string, assets: Array<{ content: string, name: string }>, domain: string, bucket: string },
  }>('/deploy', async (req, reply) => {
    try {
      const { name, code, assets, domain, bucket } = req.body

      const func = await prisma.function.upsert({
        where: {
          name,
        },
        update: {
          domain,
          bucket,
          assets: {
            createMany: {
              data: assets.map(({ name }) => ({
                name: name,
              })),
            },
          },
        },
        create: {
          name,
          domain,
          bucket,
          assets: {
            createMany: {
              data: assets.map(({ name }) => ({
                name: name,
              })),
            },
          },
        },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          assets: true,
          bucket: true
        },
      })

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: `${name}.js`,
          Body: code,
        }),
      )

      for (const asset of assets) {
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: path.join(name, asset.name),
            Body: asset.content,
          }),
        )
      }
      await deployFunction(func.id)

      reply.send({ status: true })
    } catch (e) {
      console.log(e)
      reply.status(500)
    }
  })

  api.post<{
    Params: { id: string }
  }>('/stop/:id', async (req, reply) => {
    const func = await prisma.function.findFirstOrThrow({ where: { name: req.params.id } })

    teardownFunction(func.domain)

    await prisma.function.delete({ where: { id: func.id } })

    reply.send({ success: true })
  })

  api.get('/functions', async (req, reply) => {
    const records = await prisma.function.findMany()
    reply.send(records)
  })

  next()
}, { prefix: 'edge-api' })

app.get('/_webhooks/traefik', async (req, reply) => {
  const merge = { routers: {}, services: {} }

  if (process.env.TRAEFIK_MERGE) {
    const { data } = await axios.get(process.env.TRAEFIK_MERGE)
    merge.routers = data.http.routers
    merge.services = data.http.services
  }

  const traefik: Traefik = {
    http: {
      routers: merge.routers,
      services: merge.services,
      middlewares: {
        'redirect-to-https': {
          redirectscheme: {
            scheme: 'https',
          },
        },
        'redirect-to-http': {
          redirectscheme: {
            scheme: 'http',
          },
        },
        'redirect-to-non-www': {
          redirectregex: {
            regex: '^https?://www\\.(.+)',
            replacement: 'http://${1}',
          },
        },
        'redirect-to-www': {
          redirectregex: {
            regex: '^https?://(?:www\\.)?(.+)',
            replacement: 'http://www.${1}',
          },
        },
      },
    },
  }

  const functions = await prisma.function.findMany()

  functions.forEach((func) => {
    traefik.http.routers[func.name] = {
      entrypoints: ['web'],
      rule: `Host(\`${func.domain}\`)`,
      service: `${func.name}`,
      middlewares: ['redirect-to-https'],
    }

    traefik.http.routers[`${func.name}-secure`] = {
      entrypoints: ['websecure'],
      rule: `Host(\`${func.domain}\`)`,
      service: `${func.name}`,
      tls: {
        certresolver: 'letsencrypt',
      },
      middlewares: [],
    }

    traefik.http.services[func.name] = {
      loadbalancer: {
        servers: [
          {
            url: process.env.TRAEFIK_TARGET,
          },
        ],
      },
    }
  })

  reply.send(traefik)
})

app.all('/*', async (req, reply) => {
  try {

    const response = await dispatchFetch(req)

    if (!response) {
      reply.code(404)
      reply.send({ message: 'Deployment not found' })
      return
    }

    await response.waitUntil()

    reply.status(response.status)
    reply.raw.statusMessage = response.statusText

    for (const [key, value] of Object.entries(
      toNodeHeaders(response.headers),
    )) {
      if (value !== undefined) {
        reply.raw.setHeader(key, value)
      }
    }

    for await (const chunk of response.body as any) {
      reply.raw.write(chunk)
    }
    reply.raw.end()
  } catch (e) {
    console.log(e)
    reply.status(500)
  }
})

function toNodeHeaders(headers?: any): NodeHeaders {
  const result: NodeHeaders = {}
  if (headers) {
    for (const [key, value] of headers.entries()) {
      result[key] =
        key.toLowerCase() === 'set-cookie'
          ? // @ts-ignore getAll is hidden in Headers but exists.
          headers.getAll('set-cookie')
          : value
    }
  }
  return result
}


export default app
