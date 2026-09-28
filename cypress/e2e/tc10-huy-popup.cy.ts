describe('TC10 - Hủy popup không lưu', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Nhập dở dang rồi đóng popup, món không được tạo', () => {
    const tenMonTest = `Mon Test TC10 ${Date.now()}`

    cy.contains('button', 'Thêm món').should('be.visible')
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type(tenMonTest)
      cy.get('input[type="number"]').type('40000')
    })

    // Đóng popup bằng phím Escape
    cy.get('body').type('{esc}')

    cy.get('[role="dialog"]').should('not.exist')
    cy.contains(tenMonTest).should('not.exist')
    cy.contains('Đã lưu').should('not.exist')
  })
})