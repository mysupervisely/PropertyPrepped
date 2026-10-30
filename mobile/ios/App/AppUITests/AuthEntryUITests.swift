import XCTest

final class AuthEntryUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Log In"].waitForExistence(timeout: 45),
                      "Hosted homepage did not expose Log In. Inspect screenshot and site availability.")
    }

    override func tearDownWithError() throws {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = "Accessibility tree (fictional form data only)"
        tree.lifetime = .keepAlways
        add(tree)
        app.terminate()
    }

    func testLoginFieldsAndPasswordVisibility() throws {
        app.buttons["Log In"].tap()
        let email = app.textFields.firstMatch
        let password = app.secureTextFields.firstMatch
        XCTAssertTrue(email.waitForExistence(timeout: 10))
        XCTAssertTrue(password.exists)
        email.tap()
        email.typeText("mobile-ui-test@example.invalid")
        password.tap()
        password.typeText("Fictional123!")
        let showPassword = app.switches["Show password"]
        XCTAssertTrue(showPassword.waitForExistence(timeout: 5))
        showPassword.tap()
        XCTAssertTrue(app.textFields.matching(NSPredicate(format: "value == %@", "Fictional123!")).firstMatch.waitForExistence(timeout: 5))
        let hidePassword = app.switches["Hide password"]
        XCTAssertTrue(hidePassword.waitForExistence(timeout: 5))
        hidePassword.tap()
        XCTAssertTrue(app.secureTextFields.firstMatch.waitForExistence(timeout: 5))
        // Never submit credentials or create an account against the hosted site.
    }

    func testStartFreeAndClose() throws {
        app.buttons["Start Free"].firstMatch.tap()
        XCTAssertTrue(app.switches["I manage properties"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Create account"].exists)
        XCTAssertTrue(app.textFields.firstMatch.exists)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Start Free form"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.buttons["Log In"].isHittable)
    }

    func testResetPasswordEntryAndReturn() throws {
        app.buttons["Log In"].tap()
        let forgot = app.buttons["Forgot password?"]
        XCTAssertTrue(forgot.waitForExistence(timeout: 10))
        forgot.tap()
        XCTAssertTrue(app.buttons["Send reset link"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.secureTextFields.firstMatch.exists)
        app.buttons["Back to sign in"].tap()
        XCTAssertTrue(app.secureTextFields.firstMatch.waitForExistence(timeout: 5))
        // Do not send reset email.
    }
}
