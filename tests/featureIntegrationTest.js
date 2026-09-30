// tests/featureIntegrationTest.js
const BASE_URL = "http://localhost:5001/api";

const results = [];

function logTest(id, role, feature, status, details = "") {
  results.push({ id, role, feature, status, details });
  const icon = status === "PASS" ? "✅" : "❌";
  console.log(`${icon} [${role.toUpperCase()}] ${id}: ${feature} -> ${status} ${details ? "(" + details + ")" : ""}`);
}

async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const config = {
    method: options.method || "GET",
    headers,
  };
  if (options.body) {
    config.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, config);
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

export async function runAllTests() {
  console.log("=================================================================");
  console.log("   PILATES STUDIO - MULTI-ROLE COMPREHENSIVE FEATURE TESTS");
  console.log("=================================================================\n");

  let adminToken = "";
  let staffToken = "";
  let memberToken = "";
  let memberUser = null;
  let testSessionId = null;
  let rescheduleSessionId = null;

  // -------------------------------------------------------------
  // 1. ADMIN TESTS
  // -------------------------------------------------------------
  console.log("--- 1. Testing ADMIN Features ---");
  try {
    // TC-ADM-01: Login
    const res = await request("/auth/login", {
      method: "POST",
      body: { username: "admin", password: "Admin123!" },
    });
    if (res.status === 200 && res.data?.user?.role === "admin") {
      adminToken = res.data.accessToken;
      logTest("TC-ADM-01", "Admin", "Admin Authentication", "PASS", "Logged in with Super Admin role");
    } else {
      logTest("TC-ADM-01", "Admin", "Admin Authentication", "FAIL", res.data?.message || "Invalid response");
    }
  } catch (err) {
    logTest("TC-ADM-01", "Admin", "Admin Authentication", "FAIL", err.message);
  }

  const adminHeaders = { Authorization: `Bearer ${adminToken}` };

  // TC-ADM-02: Get all users
  try {
    const res = await request("/users/all", { headers: adminHeaders });
    if (res.status === 200 && Array.isArray(res.data?.users)) {
      logTest("TC-ADM-02", "Admin", "Fetch All Users (/users/all)", "PASS", `Found ${res.data.users.length} registered accounts`);
    } else {
      logTest("TC-ADM-02", "Admin", "Fetch All Users (/users/all)", "FAIL", res.data?.message || "Not array");
    }
  } catch (err) {
    logTest("TC-ADM-02", "Admin", "Fetch All Users (/users/all)", "FAIL", err.message);
  }

  // TC-ADM-03: Create New Session with unique non-overlapping trainer & time
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 5);
  const testDateStr = testDate.toISOString().split("T")[0];

  try {
    const res = await request("/sessions/create", {
      method: "POST",
      headers: adminHeaders,
      body: {
        date: testDateStr,
        time: "15:00",
        duration: 45,
        type: "Pilates Reformer Core Test",
        difficulty: "Intermediate",
        maxParticipants: 4,
        trainerName: "Master Trainer Liam",
        location: "Studio",
        description: "Automated test session",
      },
    });
    const s = res.data?.session || res.data;
    if (res.status === 201 && s?._id) {
      testSessionId = s._id;
      const isEnglish = s.status === "Planned" && s.location === "Studio";
      logTest(
        "TC-ADM-03",
        "Admin",
        "Create Session (/sessions/create)",
        isEnglish ? "PASS" : "FAIL",
        `Created session ${testSessionId} (status=${s.status}, location=${s.location}, time=15:00)`
      );
    } else {
      logTest("TC-ADM-03", "Admin", "Create Session (/sessions/create)", "FAIL", res.data?.message || "Creation failed");
    }
  } catch (err) {
    logTest("TC-ADM-03", "Admin", "Create Session (/sessions/create)", "FAIL", err.message);
  }

  // Create second session for reschedule testing
  try {
    const res2 = await request("/sessions/create", {
      method: "POST",
      headers: adminHeaders,
      body: {
        date: testDateStr,
        time: "16:00",
        duration: 45,
        type: "Pilates Tower Flow Test",
        difficulty: "Beginner",
        maxParticipants: 5,
        trainerName: "Master Trainer Liam",
        location: "Studio",
      },
    });
    const s2 = res2.data?.session || res2.data;
    if (res2.status === 201 && s2?._id) {
      rescheduleSessionId = s2._id;
    }
  } catch (e) {}

  // TC-ADM-04: Update Session
  if (testSessionId) {
    try {
      const res = await request(`/sessions/update/${testSessionId}`, {
        method: "PUT",
        headers: adminHeaders,
        body: {
          duration: 55,
          notes: "Updated by automated test",
        },
      });
      const s = res.data?.session || res.data;
      if (res.status === 200 && s?.duration === 55) {
        logTest("TC-ADM-04", "Admin", "Update Session (/sessions/update/:id)", "PASS", "Updated duration to 55m");
      } else {
        logTest("TC-ADM-04", "Admin", "Update Session (/sessions/update/:id)", "FAIL", res.data?.message || "Update failed");
      }
    } catch (err) {
      logTest("TC-ADM-04", "Admin", "Update Session (/sessions/update/:id)", "FAIL", err.message);
    }
  }

  // TC-ADM-05: Bulk 7-Day Schedule Generator
  try {
    const res = await request("/sessions/bulk-create-week", {
      method: "POST",
      headers: adminHeaders,
      body: {},
    });
    if (res.status === 201) {
      logTest("TC-ADM-05", "Admin", "Bulk 7-Day Schedule Generator", "PASS", `Bulk schedule verified (created ${res.data.createdCount} new slots)`);
    } else {
      logTest("TC-ADM-05", "Admin", "Bulk 7-Day Schedule Generator", "FAIL", res.data?.message || "Bulk failed");
    }
  } catch (err) {
    logTest("TC-ADM-05", "Admin", "Bulk 7-Day Schedule Generator", "FAIL", err.message);
  }

  // -------------------------------------------------------------
  // 2. STAFF / TRAINER TESTS
  // -------------------------------------------------------------
  console.log("\n--- 2. Testing STAFF / TRAINER Features ---");
  try {
    const res = await request("/auth/login", {
      method: "POST",
      body: { username: "staff", password: "Staff123!" },
    });
    if (res.status === 200 && res.data?.user?.role === "staff") {
      staffToken = res.data.accessToken;
      logTest("TC-STF-01", "Staff", "Staff Authentication", "PASS", "Logged in with Staff role");
    } else {
      logTest("TC-STF-01", "Staff", "Staff Authentication", "FAIL", res.data?.message || "Invalid credentials");
    }
  } catch (err) {
    logTest("TC-STF-01", "Staff", "Staff Authentication", "FAIL", err.message);
  }

  const staffHeaders = { Authorization: `Bearer ${staffToken}` };

  // TC-STF-02: Fetch All Classes Schedule
  try {
    const res = await request("/sessions/soon", { headers: staffHeaders });
    if (res.status === 200 && Array.isArray(res.data)) {
      logTest("TC-STF-02", "Staff", "Fetch Upcoming Classes (/sessions/soon)", "PASS", `Fetched ${res.data.length} active classes`);
    } else {
      logTest("TC-STF-02", "Staff", "Fetch Upcoming Classes (/sessions/soon)", "FAIL", "Invalid data");
    }
  } catch (err) {
    logTest("TC-STF-02", "Staff", "Fetch Upcoming Classes (/sessions/soon)", "FAIL", err.message);
  }

  // TC-STF-03: Staff CANNOT Book for Self (Business Rule Verification)
  if (testSessionId) {
    try {
      const res = await request(`/sessions/register/${testSessionId}`, {
        method: "POST",
        headers: staffHeaders,
      });
      if (res.status === 403) {
        logTest("TC-STF-03", "Staff", "Staff Cannot Book For Self Rule", "PASS", "Blocked with 403: " + res.data?.message);
      } else {
        logTest("TC-STF-03", "Staff", "Staff Cannot Book For Self Rule", "FAIL", `Returned status ${res.status}`);
      }
    } catch (err) {
      logTest("TC-STF-03", "Staff", "Staff Cannot Book For Self Rule", "FAIL", err.message);
    }
  }

  // TC-STF-04: Staff Create Member & Register To Class
  let createdMemberId = null;
  const testPhone = `998877${Math.floor(1000 + Math.random() * 9000)}`;
  if (testSessionId) {
    try {
      const res = await request(`/sessions/create-and-register/${testSessionId}`, {
        method: "POST",
        headers: staffHeaders,
        body: {
          username: `client_${testPhone.slice(-4)}`,
          fullName: "Alice Wonderland",
          email: `alice_${testPhone.slice(-4)}@example.com`,
          phone: testPhone,
        },
      });
      if (res.status === 201 && res.data?.member?._id) {
        createdMemberId = res.data.member._id;
        logTest(
          "TC-STF-04",
          "Staff",
          "Staff Create Member & Book Class (/create-and-register)",
          "PASS",
          `Registered member ${createdMemberId} into class`
        );
      } else {
        logTest("TC-STF-04", "Staff", "Staff Create Member & Book Class (/create-and-register)", "FAIL", res.data?.message || "Registration failed");
      }
    } catch (err) {
      logTest("TC-STF-04", "Staff", "Staff Create Member & Book Class (/create-and-register)", "FAIL", err.message);
    }
  }

  // TC-STF-05: Staff Removes Member From Class
  if (testSessionId && createdMemberId) {
    try {
      const res = await request(`/sessions/unregister/${testSessionId}/${createdMemberId}`, {
        method: "POST",
        headers: staffHeaders,
      });
      if (res.status === 200) {
        logTest("TC-STF-05", "Staff", "Staff Remove Member From Class (/unregister/:sId/:uId)", "PASS", "Member removed from class successfully");
      } else {
        logTest("TC-STF-05", "Staff", "Staff Remove Member From Class (/unregister/:sId/:uId)", "FAIL", res.data?.message || "Unregister failed");
      }
    } catch (err) {
      logTest("TC-STF-05", "Staff", "Staff Remove Member From Class (/unregister/:sId/:uId)", "FAIL", err.message);
    }
  }

  // -------------------------------------------------------------
  // 3. MEMBER (USER) TESTS
  // -------------------------------------------------------------
  console.log("\n--- 3. Testing MEMBER (USER) Features ---");
  const memberPhone = "9876543210";
  try {
    // TC-MBR-01: Member OTP Verification / Registration
    const res = await request("/auth/verify-otp", {
      method: "POST",
      body: {
        phone: memberPhone,
        otp: "123456",
        fullName: "John Pilates Member",
      },
    });
    if (res.status === 200 && res.data?.user?.role === "user") {
      memberToken = res.data.accessToken;
      memberUser = res.data.user;
      logTest("TC-MBR-01", "Member", "Member OTP Authentication & Creation", "PASS", `Logged in as ${memberUser.fullName} (role: ${memberUser.role})`);
    } else {
      logTest("TC-MBR-01", "Member", "Member OTP Authentication & Creation", "FAIL", res.data?.message || "OTP verification failed");
    }
  } catch (err) {
    logTest("TC-MBR-01", "Member", "Member OTP Authentication & Creation", "FAIL", err.message);
  }

  const memberHeaders = { Authorization: `Bearer ${memberToken}` };

  // TC-MBR-02: Member Books Class
  if (testSessionId && memberToken) {
    try {
      const res = await request(`/sessions/register/${testSessionId}`, {
        method: "POST",
        headers: memberHeaders,
      });
      if (res.status === 200) {
        logTest("TC-MBR-02", "Member", "Book Class (/sessions/register/:id)", "PASS", "Member successfully booked class");
      } else {
        logTest("TC-MBR-02", "Member", "Book Class (/sessions/register/:id)", "FAIL", res.data?.message || "Booking failed");
      }
    } catch (err) {
      logTest("TC-MBR-02", "Member", "Book Class (/sessions/register/:id)", "FAIL", err.message);
    }
  }

  // TC-MBR-03: Member Double-Booking Prevention
  if (testSessionId && memberToken) {
    try {
      const res = await request(`/sessions/register/${testSessionId}`, {
        method: "POST",
        headers: memberHeaders,
      });
      if (res.status === 400 && res.data?.message?.includes("Already registered")) {
        logTest("TC-MBR-03", "Member", "Double Booking Prevention", "PASS", "Properly rejected duplicate booking: " + res.data.message);
      } else {
        logTest("TC-MBR-03", "Member", "Double Booking Prevention", "FAIL", `Returned status ${res.status}: ${res.data?.message}`);
      }
    } catch (err) {
      logTest("TC-MBR-03", "Member", "Double Booking Prevention", "FAIL", err.message);
    }
  }

  // TC-MBR-04: Fetch My Upcoming Bookings
  if (memberToken) {
    try {
      const res = await request("/sessions/myupcoming", { headers: memberHeaders });
      if (res.status === 200 && Array.isArray(res.data)) {
        const hasBooked = res.data.some((s) => s._id === testSessionId);
        logTest("TC-MBR-04", "Member", "Fetch My Upcoming Bookings (/myupcoming)", hasBooked ? "PASS" : "FAIL", `Found ${res.data.length} bookings, booked testSession found: ${hasBooked}`);
      } else {
        logTest("TC-MBR-04", "Member", "Fetch My Upcoming Bookings (/myupcoming)", "FAIL", res.data?.message || "Invalid data");
      }
    } catch (err) {
      logTest("TC-MBR-04", "Member", "Fetch My Upcoming Bookings (/myupcoming)", "FAIL", err.message);
    }
  }

  // TC-MBR-05: Member Reschedule Class
  if (testSessionId && rescheduleSessionId && memberToken) {
    try {
      const res = await request("/sessions/reschedule", {
        method: "POST",
        headers: memberHeaders,
        body: {
          oldSessionId: testSessionId,
          newSessionId: rescheduleSessionId,
        },
      });
      if (res.status === 200) {
        logTest("TC-MBR-05", "Member", "Reschedule Class (/sessions/reschedule)", "PASS", "Rescheduled to new session successfully");
      } else {
        logTest("TC-MBR-05", "Member", "Reschedule Class (/sessions/reschedule)", "FAIL", res.data?.message || "Reschedule failed");
      }
    } catch (err) {
      logTest("TC-MBR-05", "Member", "Reschedule Class (/sessions/reschedule)", "FAIL", err.message);
    }
  }

  // TC-MBR-06: Member Unregister / Cancel Booking
  const activeSessionId = rescheduleSessionId || testSessionId;
  if (activeSessionId && memberToken) {
    try {
      const res = await request(`/sessions/unregister/${activeSessionId}`, {
        method: "POST",
        headers: memberHeaders,
      });
      if (res.status === 200) {
        logTest("TC-MBR-06", "Member", "Cancel Personal Booking (/sessions/unregister/:id)", "PASS", "Successfully unregistered from session");
      } else {
        logTest("TC-MBR-06", "Member", "Cancel Personal Booking (/sessions/unregister/:id)", "FAIL", res.data?.message || "Unregister failed");
      }
    } catch (err) {
      logTest("TC-MBR-06", "Member", "Cancel Personal Booking (/sessions/unregister/:id)", "FAIL", err.message);
    }
  }

  // TC-MBR-07: Join & Leave Waiting List
  if (testSessionId && memberToken) {
    try {
      const joinWait = await request(`/sessions/waitlist/${testSessionId}`, {
        method: "POST",
        headers: memberHeaders,
      });
      const leaveWait = await request(`/sessions/waitlist/${testSessionId}`, {
        method: "DELETE",
        headers: memberHeaders,
      });
      if (joinWait.status === 200 && leaveWait.status === 200) {
        logTest("TC-MBR-07", "Member", "Waiting List Join & Leave (/waitlist/:id)", "PASS", "Successfully joined and left waitlist");
      } else {
        logTest("TC-MBR-07", "Member", "Waiting List Join & Leave (/waitlist/:id)", "FAIL", "Waitlist operation failed");
      }
    } catch (err) {
      logTest("TC-MBR-07", "Member", "Waiting List Join & Leave (/waitlist/:id)", "FAIL", err.message);
    }
  }

  // TC-MBR-08: Member Permission Boundary Check (Attempting Admin Route)
  if (memberToken) {
    try {
      const res = await request("/users/all", { headers: memberHeaders });
      if (res.status === 403) {
        logTest("TC-MBR-08", "Member", "Role Access Boundary (Member calling /users/all)", "PASS", "Properly blocked with 403 Forbidden");
      } else {
        logTest("TC-MBR-08", "Member", "Role Access Boundary (Member calling /users/all)", "FAIL", `Expected 403, got ${res.status}`);
      }
    } catch (err) {
      logTest("TC-MBR-08", "Member", "Role Access Boundary (Member calling /users/all)", "FAIL", err.message);
    }
  }

  // -------------------------------------------------------------
  // 4. CLEANUP / ADMIN DELETE
  // -------------------------------------------------------------
  console.log("\n--- 4. Cleanup & Admin Cancellation/Deletion ---");
  if (testSessionId && adminToken) {
    try {
      const res = await request(`/sessions/cancel/${testSessionId}`, {
        method: "PUT",
        headers: adminHeaders,
      });
      const s = res.data?.session || res.data;
      if (res.status === 200 && s?.status === "Cancelled") {
        logTest("TC-ADM-06", "Admin", "Cancel Session (/sessions/cancel/:id)", "PASS", "Session marked as Cancelled");
      } else {
        logTest("TC-ADM-06", "Admin", "Cancel Session (/sessions/cancel/:id)", "FAIL", res.data?.message || "Cancel failed");
      }
    } catch (err) {
      logTest("TC-ADM-06", "Admin", "Cancel Session (/sessions/cancel/:id)", "FAIL", err.message);
    }

    try {
      const res = await request(`/sessions/delete/${testSessionId}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
      if (res.status === 200) {
        logTest("TC-ADM-07", "Admin", "Delete Session (/sessions/delete/:id)", "PASS", "Session deleted successfully");
      } else {
        logTest("TC-ADM-07", "Admin", "Delete Session (/sessions/delete/:id)", "FAIL", res.data?.message || "Delete failed");
      }
    } catch (err) {
      logTest("TC-ADM-07", "Admin", "Delete Session (/sessions/delete/:id)", "FAIL", err.message);
    }
  }

  if (rescheduleSessionId && adminToken) {
    try {
      await request(`/sessions/delete/${rescheduleSessionId}`, {
        method: "DELETE",
        headers: adminHeaders,
      });
    } catch (e) {}
  }

  console.log("\n=================================================================");
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  console.log(`TOTAL TEST CASES: ${results.length}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log("=================================================================");
  return { results, passCount, failCount };
}

if (process.argv[1]?.endsWith("featureIntegrationTest.js")) {
  runAllTests().catch((err) => {
    console.error("Fatal Test Runner Error:", err);
    process.exit(1);
  });
}
