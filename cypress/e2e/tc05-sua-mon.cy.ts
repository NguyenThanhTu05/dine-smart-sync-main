describe('TC05 - Sửa món đã có', () => {
  const tenGoc = 'Chả Giò Hải Sản'
const tenMoi = 'Chả Giò Hải Sản (Đã sửa)'

  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Bấm Sửa, đổi Tên, Lưu, tên mới cập nhật đúng', () => {
    cy.contains('button', 'Thêm món').should('be.visible')

    cy.contains(tenGoc, { timeout: 10000 })
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.contains('button', 'Sửa').click()
      })

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).clear().type(tenMoi)
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')
    cy.contains(tenMoi).should('exist')

    cy.contains(tenMoi, { timeout: 10000 })
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.contains('button', 'Sửa').click()
      })

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).clear().type(tenGoc)
      cy.contains('button', 'Lưu').click()
    })

    cy.contains(tenGoc).should('exist')
  })
})