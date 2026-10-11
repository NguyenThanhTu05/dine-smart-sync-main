import { expect, it } from 'vitest';
import { accountCreatedResponse, accountResponse } from './functionResponses';
it('requires a server account ID and success before acknowledging account creation', () => {
  expect(accountCreatedResponse.safeParse({ok:true,user_id:'00000000-0000-4000-8000-000000000001'}).success).toBe(true);
  for (const value of [{ok:true},{ok:true,user_id:'invalid'},{ok:false,user_id:'00000000-0000-4000-8000-000000000001'},null]) expect(accountCreatedResponse.safeParse(value).success).toBe(false);
});
it('allows non-creation actions to return success without creating a new ID', () => {
  expect(accountResponse.safeParse({ok:true}).success).toBe(true);
  expect(accountResponse.safeParse({ok:'true'}).success).toBe(false);
});
