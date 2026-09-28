describe('TC02 - Thêm món thiếu Tên', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Để trống Tên, chỉ nhập Giá, hệ thống báo lỗi không cho lưu', () => {
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      // Không nhập Tên (bỏ qua ô đầu tiên)
      cy.get('input[type="number"]').type('50000') // chỉ nhập Giá
      cy.contains('button', 'Lưu').click()
    })

    // Phải hiện đúng thông báo lỗi từ code
    cy.contains('Vui lòng nhập đầy đủ Tên và Giá!').should('exist')

    // Popup vẫn còn mở (chưa đóng vì lưu thất bại)
    cy.get('[role="dialog"]').should('exist')
  })
})