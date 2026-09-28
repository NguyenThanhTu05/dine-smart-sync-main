describe('TC06 - Đổi trạng thái Có sẵn', () => {
  const tenMon = 'Bún Thịt Nướng'

  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Tắt switch Có sẵn của món đang có, lưu thành công, rồi bật lại như cũ', () => {
    cy.contains('button', 'Thêm món').should('be.visible')

    // Mở popup Sửa của đúng món "Bún Thịt Nướng"
    cy.contains(tenMon, { timeout: 10000 })
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.contains('button', 'Sửa').click()
      })

    // Tắt switch "Có sẵn"
    cy.get('[role="dialog"]').within(() => {
      cy.contains('Có sẵn')
        .parent()
        .find('button[role="switch"]')
        .click()

      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')

    // ─── Bật lại switch Có sẵn để khôi phục trạng thái gốc ───
    cy.contains(tenMon, { timeout: 10000 })
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.contains('button', 'Sửa').click()
      })

    cy.get('[role="dialog"]').within(() => {
      cy.contains('Có sẵn')
        .parent()
        .find('button[role="switch"]')
        .click()

      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')
  })
})