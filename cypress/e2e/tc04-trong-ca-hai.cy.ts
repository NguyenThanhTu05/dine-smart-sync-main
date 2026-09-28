describe('TC04 - Để trống cả Tên và Giá', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Không nhập gì cả, bấm Lưu, hệ thống báo lỗi không cho lưu', () => {
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      // Không nhập gì cả — bấm Lưu ngay
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Vui lòng nhập đầy đủ Tên và Giá!').should('exist')

    cy.get('[role="dialog"]').should('exist')
  })
})