describe('TC09 - Nhập Giá là số âm', () => {
  const tenMonMoi = `Mon Test TC09 ${Date.now()}`

  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Nhập Giá âm, hệ thống PHẢI chặn không cho lưu', () => {
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type(tenMonMoi)
      cy.get('input[type="number"]').type('-50000')
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Giá phải lớn hơn 0').should('be.visible')

    // ─── ASSERT món KHÔNG được phép tồn tại ───
    cy.contains(tenMonMoi).should('not.exist')
  })

  afterEach(() => {
    // Dọn dẹp nếu lỡ web vẫn tạo món (trường hợp fail)
    cy.on('window:confirm', () => true)
    cy.get('body').then(($body) => {
      if ($body.text().includes(tenMonMoi)) {
        cy.contains(tenMonMoi)
          .first()
          .parents('.overflow-hidden')
          .first()
          .within(() => {
            cy.get('button').last().click()
          })
      }
    })
  })
})