package com.proproster.app;

import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Native accessibility checks. Never submit credentials or create an account. */
@RunWith(AndroidJUnit4.class)
public class AuthEntryTest {
    private final UiAutomation ui = InstrumentationRegistry.getInstrumentation().getUiAutomation();
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private File output(String name) {
        File directory = new File(context.getFilesDir(), "auth-test-evidence");
        assertTrue("Test evidence directory unavailable", directory.isDirectory() || directory.mkdirs());
        return new File(directory, name);
    }

    private void capture(String name) throws Exception {
        Bitmap screenshot = ui.takeScreenshot();
        assertNotNull("Screenshot unavailable", screenshot);
        try (FileOutputStream stream = new FileOutputStream(output(name + ".png"))) {
            assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream));
        } finally { screenshot.recycle(); }
    }

    private boolean named(AccessibilityNodeInfo node, String label) {
        CharSequence text = node.getText();
        CharSequence description = node.getContentDescription();
        return (text != null && label.contentEquals(text))
            || (description != null && label.contentEquals(description));
    }

    private AccessibilityNodeInfo find(AccessibilityNodeInfo node, String label, boolean clickable) {
        if (node == null) return null;
        if (node.isVisibleToUser() && named(node, label)) {
            AccessibilityNodeInfo target = node;
            while (clickable && !target.isClickable() && target.getParent() != null) {
                target = target.getParent();
            }
            if (target.isEnabled() && (!clickable || target.isClickable())) return target;
        }
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo found = find(node.getChild(index), label, clickable);
            if (found != null) return found;
        }
        return null;
    }

    private AccessibilityNodeInfo await(String label, boolean clickable) {
        System.out.println("Checking accessible element: " + label);
        long deadline = SystemClock.uptimeMillis() + 30000;
        do {
            AccessibilityNodeInfo node = find(ui.getRootInActiveWindow(), label, clickable);
            if (node != null) return node;
            SystemClock.sleep(500);
        } while (SystemClock.uptimeMillis() < deadline);
        throw new AssertionError("Accessible element not found: " + label);
    }

    private void tap(String label) {
        assertTrue("Click failed: " + label,
            await(label, true).performAction(AccessibilityNodeInfo.ACTION_CLICK));
    }

    private void describe(AccessibilityNodeInfo node, StringBuilder result, int depth) {
        if (node == null || depth > 60) return;
        result.append(node.getClassName()).append(" | ")
            .append(node.getText()).append(" | ").append(node.getContentDescription()).append('\n');
        for (int index = 0; index < node.getChildCount(); index++) {
            describe(node.getChild(index), result, depth + 1);
        }
    }

    @Test public void loginResetAndSignupEntry() throws Throwable {
        Throwable failure = null;
        try {
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            assertNotNull("Main activity launch intent missing", launch);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            context.startActivity(launch);
            long entryDeadline = SystemClock.uptimeMillis() + 30000;
            while (find(ui.getRootInActiveWindow(), "Log In", true) == null
                && find(ui.getRootInActiveWindow(), "We couldn’t connect.", false) == null
                && SystemClock.uptimeMillis() < entryDeadline) {
                SystemClock.sleep(500);
            }
            boolean recovery = find(ui.getRootInActiveWindow(), "We couldn’t connect.", false) != null;
            try (FileOutputStream stream = new FileOutputStream(output("connection-recovery.txt"))) {
                stream.write(("Initial recovery screen: " + recovery + "\n").getBytes(StandardCharsets.UTF_8));
            }
            if (recovery) {
                capture("initial-connection-recovery");
                tap("Try again");
                await("Log In", true);
                capture("connection-retry-returned-to-landing");
            }
            tap("Log In");
            await("Sign in to PropRoster", false);
            await("Email", false);
            capture("login-entry");
            tap("Forgot password?");
            await("Reset your password", false);
            capture("password-reset-entry");
            tap("Back to sign in");
            await("Sign in to PropRoster", false);
            tap("Close");
            tap("Start Free");
            await("Create your PropRoster account", false);
            await("I manage properties", false);
            capture("signup-entry");
            tap("Close");
            await("Log In", true);
            capture("auth-returned-to-landing");
        } catch (Throwable error) {
            failure = error;
            throw error;
        } finally {
          try {
            capture("auth-final-state");
            StringBuilder description = new StringBuilder();
            describe(ui.getRootInActiveWindow(), description, 0);
            try (FileOutputStream stream = new FileOutputStream(output("auth-final-hierarchy.txt"))) {
                stream.write(description.toString().getBytes(StandardCharsets.UTF_8));
            }
          } catch (Throwable diagnosticError) {
            if (failure != null) failure.addSuppressed(diagnosticError);
            else throw diagnosticError;
          }
        }
    }
}
