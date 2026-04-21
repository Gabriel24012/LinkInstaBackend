package com.iha.test.linkinstareview.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface TargetUserDao {
    @Query("SELECT * FROM target_users ORDER BY username ASC")
    fun observeAll(): Flow<List<TargetUserEntity>>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(user: TargetUserEntity)

    @Query("DELETE FROM target_users WHERE username = :username")
    suspend fun delete(username: String)
}
