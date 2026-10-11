import { describe,expect,it } from 'vitest'
import { coordinateInput,dateInput,decimalInput,passwordInput,phoneInput,requiredText,usernameInput } from './inputValidation'

describe('raw restaurant input validation', () => {
  it.each(['', ' ', '-1', 'abc', '1e3', 'Infinity', 'NaN', '1,5', '1.2345', '1.', '.', '0x10', '1\n', '1'.repeat(33)])('rejects malformed stock %j', value => {
    expect(() => decimalInput(value, 'Kho')).toThrow()
  })
  it('supports exact price/stock precision, zero price and positive integral seats', () => {
    expect(decimalInput('0', 'Giá', 2)).toBe(0)
    expect(decimalInput('12.125', 'Kho')).toBe(12.125)
    expect(() => decimalInput('1.001', 'Giá', 2)).toThrow()
    expect(decimalInput('12', 'Ghế', 0, 1000, true)).toBe(12)
    for (const value of ['0', '1.5', '1001']) expect(() => decimalInput(value, 'Ghế', 0, 1000, true)).toThrow()
    expect(() => decimalInput('101', 'VAT', 6, 100)).toThrow()
  })
  it('preserves phone prefixes and credentials; validates only appropriate text', () => {
    expect(phoneInput(' 0901234567 ')).toBe('0901234567')
    expect(phoneInput('+84 (90) 123-4567')).toBe('+84 (90) 123-4567')
    expect(() => phoneInput('phone123')).toThrow()
    expect(requiredText('  Món bò & rau  ', 'Tên')).toBe('Món bò & rau')
    expect(() => requiredText('  ', 'Tên')).toThrow()
    expect(() => requiredText('a'.repeat(201), 'Tên')).toThrow()
    expect(() => requiredText('a\u0001', 'Tên')).toThrow()
    expect(passwordInput(' abc123 ')).toBe(' abc123 ')
    expect(() => passwordInput('       ')).toThrow()
    expect(() => usernameInput('a@b')).toThrow()
  })
  it('rejects impossible dates and invalid GPS coordinates without empty-to-zero coercion', () => {
    expect(dateInput('', 'Ngày')).toBeNull()
    expect(dateInput('2024-02-29', 'Ngày')).toBe('2024-02-29')
    expect(() => dateInput('2025-02-29', 'Ngày')).toThrow()
    expect(() => dateInput('2099-01-01', 'Ngày sinh', false)).toThrow()
    expect(coordinateInput('-10.123', 'Vĩ độ', 90)).toBe(-10.123)
    for (const value of ['', ' ', 'abc', '91', '1e2']) expect(() => coordinateInput(value, 'Vĩ độ', 90)).toThrow()
  })
})
