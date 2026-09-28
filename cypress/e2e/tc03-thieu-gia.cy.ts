describe('TC03 - Thêm món thiếu Giá', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Nhập Tên nhưng để trống Giá, hệ thống báo lỗi không cho lưu', () => {
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type('Món Test Thiếu Giá') // chỉ nhập Tên
      // Không nhập Giá (bỏ qua ô input[type=number])
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Vui lòng nhập đầy đủ Tên và Giá!').should('exist')

    cy.get('[role="dialog"]').should('exist')
  })
})