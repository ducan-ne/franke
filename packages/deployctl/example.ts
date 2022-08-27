addEventListener('fetch', (event: any) => {
  const { searchParams } = new URL(event.request.url)
  const url = searchParams.get('url')
  return event.respondWith(fetch(url!))
})
