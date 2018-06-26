import { escape } from '../run';

test('should escape quotes and spaces', () => {
  expect(escape(`" '!?a1`)).toEqual(`|Q||S|'!?a1`);
});
