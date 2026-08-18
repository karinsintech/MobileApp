/**
 * Role access menus — loads web Role Management privileges for the signed-in
 * user so mobile menus/screens honour the same restrictions as the portal.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { roleApi } from '../../services/api/roleApi';
import type { AccessMenuItem } from '../../types/accessMenus';
import { signIn, signInWithPin, signOut, restoreSession } from './authSlice';

interface RoleState {
  accessMenus: AccessMenuItem[];
  /** True after a successful fetch (empty array still counts as loaded). */
  privilegesLoaded: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: RoleState = {
  accessMenus: [],
  privilegesLoaded: false,
  isLoading: false,
  error: null,
};

export const fetchAccessMenus = createAsyncThunk<
  AccessMenuItem[],
  { userId: number; roleId: number },
  { rejectValue: string }
>('role/fetchAccessMenus', async ({ userId, roleId }, { rejectWithValue }) => {
  try {
    const { data } = await roleApi.getUserAccess(userId, roleId);
    const menus = Array.isArray(data?.accessMenus) ? data.accessMenus : [];
    return menus;
  } catch (error: any) {
    return rejectWithValue(error?.message ?? 'Unable to load role access.');
  }
});

const roleSlice = createSlice({
  name: 'role',
  initialState,
  reducers: {
    clearAccessMenus(state) {
      state.accessMenus = [];
      state.privilegesLoaded = false;
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccessMenus.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchAccessMenus.fulfilled, (state, action) => {
        state.isLoading = false;
        state.accessMenus = action.payload;
        // Mark loaded even when empty — empty means admin revoked all menus.
        state.privilegesLoaded = true;
        state.error = null;
      })
      .addCase(fetchAccessMenus.rejected, (state, action) => {
        state.isLoading = false;
        // Keep privilegesLoaded false so mapped features fail closed until a
        // successful privilege fetch proves access.
        state.error = action.payload ?? 'Unable to load role access.';
      })
      // Wipe privileges whenever auth identity changes or ends.
      .addCase(signIn.pending, () => initialState)
      .addCase(signInWithPin.pending, () => initialState)
      .addCase(signOut.fulfilled, () => initialState)
      .addCase(signOut.rejected, () => initialState)
      .addCase(restoreSession.fulfilled, (state, action) => {
        if (!action.payload) {
          return initialState;
        }
      });
  },
});

export const { clearAccessMenus } = roleSlice.actions;
export default roleSlice.reducer;
