describe('TC08 - Xóa món', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Tạo món mới rồi xóa, món biến mất khỏi danh sách, toast báo đúng', () => {
    const tenMonMoi = `Mon Test TC08 ${Date.now()}`

    // Bước 1: Tạo món để có đối tượng xóa
    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type(tenMonMoi)
      cy.get('input[type="number"]').type('15000')
      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')
    cy.contains(tenMonMoi, { timeout: 10000 }).should('exist')

    // Bước 2: Xóa món vừa tạo
    cy.on('window:confirm', () => true) // tự động xác nhận hộp thoại confirm()

    cy.contains(tenMonMoi)
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.get('button').last().click() // nút thùng rác
      })

    // Bước 3: Xác nhận món đã biến mất
    cy.contains(tenMonMoi).should('not.exist')
  })
})