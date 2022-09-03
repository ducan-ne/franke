import { Hono } from 'hono'
import { jsx } from 'hono/jsx'
import { serveStatic } from 'hono/serve-static'
import type { RedisClientType } from 'redis'

declare global {
  var Redis: RedisClientType;
}

const app = new Hono()

app.get('/', (c) => {
  console.log('Hello from Hono')
  return c.text('Hono v2!!')
})

app.get('/2', (c) => {
  return c.html('<b>ducan</b>')
})

app.get('/3', (c) => {
  return c.html(<b>ducan3</b>)
})

app.get('/4', async(c) => {
  const v = await Redis.incr('test-redis')
  return c.text(String(v))
})

app.use('/static/*', serveStatic({ root: './' }))

app.fire()
