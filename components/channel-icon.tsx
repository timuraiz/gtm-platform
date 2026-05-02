import { Mail } from 'lucide-react'

export function ChannelIcon({
  channel,
  size = 14,
  className = '',
}: {
  channel: 'linkedin' | 'email'
  size?: number
  className?: string
}) {
  if (channel === 'email') return <Mail size={size} className={className} />
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size} className={className}>
      <path d="M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5ZM8 19H5v-9h3v9ZM6.5 8.7a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4ZM20 19h-3v-4.7c0-1.2-.5-1.9-1.5-1.9-1 0-1.5.7-1.5 1.9V19h-3v-9h3v1.3c.6-.9 1.6-1.5 2.7-1.5 2 0 3.3 1.4 3.3 3.7V19Z"/>
    </svg>
  )
}
