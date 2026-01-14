/**
 * 用戶角色遷移腳本
 *
 * 將現有 users.role 和 users.isApproved 資料遷移到 user_roles 表
 *
 * 使用方式：
 * npx tsx server/scripts/migrate-user-roles.ts
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function migrateUserRoles() {
  console.log("========================================");
  console.log("開始遷移用戶角色資料");
  console.log("========================================\n");

  try {
    // Step 1: 建立 user_roles 表（如果不存在）
    console.log("Step 1: 確保 user_roles 表存在...");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        role VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
        approved_at TIMESTAMP,
        approved_by VARCHAR REFERENCES users(id),
        rejected_at TIMESTAMP,
        rejected_by VARCHAR REFERENCES users(id),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✓ user_roles 表已就緒\n");

    // Step 2: 建立索引
    console.log("Step 2: 建立索引...");
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_user_roles_user" ON user_roles(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_user_roles_role" ON user_roles(role)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "IDX_user_roles_status" ON user_roles(status)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_roles_user_role" ON user_roles(user_id, role)`);
    console.log("✓ 索引建立完成\n");

    // Step 3: 取得所有用戶
    console.log("Step 3: 讀取現有用戶資料...");
    const usersResult = await db.execute(sql`
      SELECT id, role, is_approved, created_at FROM users
    `);
    const users = usersResult.rows;
    console.log(`✓ 找到 ${users.length} 位用戶\n`);

    // Step 4: 遷移資料
    console.log("Step 4: 開始遷移角色資料...");
    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      const userId = user.id as string;
      const role = user.role as string || 'traveler';
      const isApproved = user.is_approved as boolean;
      const createdAt = user.created_at as Date;

      // 檢查是否已經有這個角色
      const existingRole = await db.execute(sql`
        SELECT id FROM user_roles WHERE user_id = ${userId} AND role = ${role}
      `);

      if (existingRole.rows.length > 0) {
        skippedCount++;
        continue;
      }

      // 決定狀態
      // traveler: 永遠是 active
      // 其他角色: 根據 isApproved 決定
      const status = role === 'traveler' ? 'active' : (isApproved ? 'active' : 'pending');
      const approvedAt = status === 'active' ? createdAt : null;

      await db.execute(sql`
        INSERT INTO user_roles (user_id, role, status, applied_at, approved_at, created_at, updated_at)
        VALUES (${userId}, ${role}, ${status}, ${createdAt}, ${approvedAt}, ${createdAt}, NOW())
      `);

      migratedCount++;

      // 對於 traveler 角色，同時確保他們有 traveler 身份
      if (role !== 'traveler') {
        const hasTravelerRole = await db.execute(sql`
          SELECT id FROM user_roles WHERE user_id = ${userId} AND role = 'traveler'
        `);

        if (hasTravelerRole.rows.length === 0) {
          await db.execute(sql`
            INSERT INTO user_roles (user_id, role, status, applied_at, approved_at, created_at, updated_at)
            VALUES (${userId}, 'traveler', 'active', ${createdAt}, ${createdAt}, ${createdAt}, NOW())
          `);
          migratedCount++;
        }
      }
    }

    console.log(`✓ 遷移完成: ${migratedCount} 筆新增, ${skippedCount} 筆跳過（已存在）\n`);

    // Step 5: 統計結果
    console.log("Step 5: 統計遷移結果...\n");
    const stats = await db.execute(sql`
      SELECT
        role,
        status,
        COUNT(*) as count
      FROM user_roles
      GROUP BY role, status
      ORDER BY role, status
    `);

    console.log("角色分佈:");
    console.log("--------------------");
    for (const row of stats.rows) {
      console.log(`  ${row.role} (${row.status}): ${row.count}`);
    }

    console.log("\n========================================");
    console.log("遷移完成！");
    console.log("========================================");
    console.log("\n注意事項:");
    console.log("1. users.role 和 users.isApproved 欄位暫時保留，待系統穩定後可移除");
    console.log("2. 登入邏輯需要更新以使用 user_roles 表");
    console.log("3. 管理後台審核頁面需要更新");

  } catch (error) {
    console.error("遷移失敗:", error);
    process.exit(1);
  }

  process.exit(0);
}

migrateUserRoles();
