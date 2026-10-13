/**
 * Role access menus — loads web Role Management privileges for the signed-in
 * user so mobile menus/screens honour the same restrictions as the portal.
 *
 * Mirrors web useFetchAccessMenus: paint from device cache first, refresh from
 * the server, and on 401/network failure keep the last good cache instead of
 * fail-closing every gated screen.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { roleApi } from '../../services/api/roleApi';
import type { AccessMenuItem } from '../../types/accessMenus';
import {
  readAccessMenusCache,
  writeAccessMenusCache,
} from '../../services/storage/accessMenusCache';
import { signIn, signInWithPin, signOut, restoreSession } from './authSlice';

interface RoleState {
  accessMenus: AccessMenuItem[];
  /**
   * True after a successful fetch OR after hydrating a device cache for this
   * user/role (web SideNav paints from cache the same way).
   */
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
    // Persist even when empty so "all revoked" survives the next 401.
    writeAccessMenusCache(userId, roleId, menus);
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
      .addCase(fetchAccessMenus.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;
        // Optimistic paint — same as web applying localforage before the network returns
        const { userId, roleId } = action.meta.arg;
        const cached = readAccessMenusCache(userId, roleId);
        if (cached) {
          state.accessMenus = cached;
          state.privilegesLoaded = true;
        }
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
        state.error = action.payload ?? 'Unable to load role access.';
        // Soft fallback like web: keep last good menus when the refresh 401s.
        // Pending may already have hydrated; re-read in case state was wiped mid-flight.
        const { userId, roleId } = action.meta.arg;
        const cached = readAccessMenusCache(userId, roleId);
        if (cached) {
          state.accessMenus = cached;
          state.privilegesLoaded = true;
        }
        // No cache → privilegesLoaded stays false → fail closed (first install)
      })
      // Wipe in-memory privileges whenever auth identity changes or ends.
      // Device cache is keyed by user/role and survives logout (see accessMenusCache).
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
