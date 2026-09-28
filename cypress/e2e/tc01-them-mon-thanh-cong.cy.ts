describe('TC01 - Thêm món thành công', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Nhập đầy đủ Tên và Giá, món mới xuất hiện trong danh sách', () => {
    const tenMonMoi = `Món Test ${Date.now()}`

    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type(tenMonMoi)
      cy.get('input[type="number"]').type('50000')
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')
    cy.contains(tenMonMoi).should('exist')
  })
})