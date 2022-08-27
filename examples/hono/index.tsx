import { Hono } from 'hono'
import { jsx } from 'hono/jsx'

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

app.fire()
