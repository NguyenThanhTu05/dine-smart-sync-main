describe('TC07 - Bật Không cần chế biến', () => {
  beforeEach(() => {
    cy.visit('/login')
    cy.get('#u').type('nguyenthanhtu26112005@gmail.com')
    cy.get('#p').type('Thanhtu261105@')
    cy.contains('button', 'Đăng nhập').click()
    cy.contains('Đăng nhập thành công').should('be.visible')

    cy.visit('/admin/catalog')
  })

  it('Bật switch Không cần chế biến, món hiện badge "có sẵn" trên card', () => {
    const tenMonMoi = `Mon Test TC07 ${Date.now()}`

    cy.contains('button', 'Thêm món').click()

    cy.get('[role="dialog"]').within(() => {
      cy.get('input').eq(0).type(tenMonMoi)
      cy.get('input[type="number"]').type('25000')

      // Bật switch "Không cần chế biến"
      cy.contains('Không cần chế biến')
        .parent()
        .parent()
        .find('button[role="switch"]')
        .click()

      cy.contains('button', 'Lưu').click()
    })

    cy.contains('Đã lưu').should('be.visible')

    // Kiểm tra badge "có sẵn" xuất hiện đúng trên card của món vừa tạo
    cy.contains(tenMonMoi, { timeout: 10000 })
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.contains('có sẵn').should('exist')
      })

    // ─── Dọn dẹp: xóa món vừa tạo ───
    cy.on('window:confirm', () => true)

    cy.contains(tenMonMoi)
      .first()
      .parents('.overflow-hidden')
      .first()
      .within(() => {
        cy.get('button').last().click()
      })

    cy.contains(tenMonMoi).should('not.exist')
  })
})