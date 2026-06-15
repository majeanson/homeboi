import { test } from '@playwright/test'
import { addLocalDays, localDayStart } from '../src/lib/localDay'
test('dbg', async () => {
  const BASE = 1_749_369_600
  console.log('BASE', BASE)
  console.log('addLocalDays(BASE,0)', addLocalDays(BASE, 0))
  console.log('localDayStart(BASE)', localDayStart(new Date(BASE * 1000)))
  console.log('BASE+DAY', BASE + 86400, 'snap', addLocalDays(BASE, 1))
})
