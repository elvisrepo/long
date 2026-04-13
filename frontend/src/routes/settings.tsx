import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsRoute,
})

function SettingsRoute() {
  return (
    <section>
      <h1>Settings</h1>
      <p>Profile and account settings will live here.</p>
    </section>
  )
}
