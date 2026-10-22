import { defineCommand } from 'yuzuha';

export default defineCommand({
  name: 'ping', description: 'Latência do gateway.',
  code: '$reply[Pong! $ping ms]',
});
