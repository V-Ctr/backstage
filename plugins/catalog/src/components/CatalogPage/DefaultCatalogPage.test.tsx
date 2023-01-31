/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CatalogApi } from '@backstage/catalog-client';
import {
  parseEntityRef,
  RELATION_MEMBER_OF,
  RELATION_OWNED_BY,
} from '@backstage/catalog-model';
import { TableColumn, TableProps } from '@backstage/core-components';
import {
  IdentityApi,
  identityApiRef,
  ProfileInfo,
  storageApiRef,
} from '@backstage/core-plugin-api';
import {
  catalogApiRef,
  entityRouteRef,
  MockStarredEntitiesApi,
  starredEntitiesApiRef,
} from '@backstage/plugin-catalog-react';
import {
  mockBreakpoint,
  MockPluginProvider,
  MockStorageApi,
  renderWithEffects,
  TestApiProvider,
  wrapInTestApp,
} from '@backstage/test-utils';
import DashboardIcon from '@material-ui/icons/Dashboard';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { createComponentRouteRef } from '../../routes';
import { CatalogTableRow } from '../CatalogTable';
import { DefaultCatalogPage } from './DefaultCatalogPage';

describe('DefaultCatalogPage', () => {
  const origReplaceState = window.history.replaceState;
  beforeEach(() => {
    window.history.replaceState = jest.fn();
  });
  afterEach(() => {
    window.history.replaceState = origReplaceState;
  });

  const mockedGetEntityFacets = jest.fn();

  const mockedGetEntities = jest.fn();

  const catalogApi: Partial<CatalogApi> = {
    getEntityFacets: mockedGetEntityFacets,
    getEntities: mockedGetEntities,
    getLocationByRef: () =>
      Promise.resolve({ id: 'id', type: 'url', target: 'url' }),
    getEntityByRef: async entityRef => {
      return {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'User',
        metadata: { name: parseEntityRef(entityRef).name },
        relations: [
          {
            type: RELATION_MEMBER_OF,
            targetRef: 'group:default/tools',
            target: { namespace: 'default', kind: 'Group', name: 'tools' },
          },
        ],
      };
    },
  };
  const testProfile: Partial<ProfileInfo> = {
    displayName: 'Display Name',
  };
  const identityApi: Partial<IdentityApi> = {
    getBackstageIdentity: async () => ({
      type: 'user',
      userEntityRef: 'user:default/guest',
      ownershipEntityRefs: ['user:default/guest', 'group:default/tools'],
    }),
    getCredentials: async () => ({ token: undefined }),
    getProfileInfo: async () => testProfile,
  };
  const storageApi = MockStorageApi.create();

  const renderWrapped = (children: React.ReactNode) =>
    renderWithEffects(
      wrapInTestApp(
        <TestApiProvider
          apis={[
            [catalogApiRef, catalogApi],
            [identityApiRef, identityApi],
            [storageApiRef, storageApi],
            [starredEntitiesApiRef, new MockStarredEntitiesApi()],
          ]}
        >
          <MockPluginProvider>{children}</MockPluginProvider>
        </TestApiProvider>,
        {
          mountedRoutes: {
            '/create': createComponentRouteRef,
            '/catalog/:namespace/:kind/:name': entityRouteRef,
          },
        },
      ),
    );

  beforeEach(() => {
    mockedGetEntities.mockImplementation(async request => {
      const ownedItem = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'Entity1',
        },
        spec: {
          owner: 'tools',
          type: 'service',
        },
        relations: [
          {
            type: RELATION_OWNED_BY,
            targetRef: 'group:default/tools',
          },
        ],
      };
      const otherItem = {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'Entity2',
        },
        spec: {
          owner: 'not-tools',
          type: 'service',
        },
        relations: [
          {
            type: RELATION_OWNED_BY,
            targetRef: 'group:default/not-tools',
            target: {
              kind: 'group',
              name: 'not-tools',
              namespace: 'default',
            },
          },
        ],
      };
      if (request.filter['relations.ownedBy']) {
        return { items: [ownedItem] };
      }
      return {
        items: [ownedItem, otherItem],
      };
    });

    mockedGetEntityFacets.mockImplementation(async () => {
      return {
        facets: {
          'metadata.uid': [
            { count: 1, value: 'uid-1' },
            { count: 1, value: 'uid-2' },
          ],
          'metadata.name': [
            { count: 1, value: 'component:default/Entity1' },
            { count: 1, value: 'component:default/Entity2' },
          ],
          'relations.ownedBy': [
            { count: 1, value: 'component:default/Entity1' },
          ],
          kind: [{ count: 1, value: 'Component' }],
          'spec.lifecycle': [
            { count: 1, value: 'production' },
            { count: 1, value: 'experimental' },
          ],
          'metadata.tags': [],
          'spec.type': [{ count: 1, value: 'service' }],
        },
      };
    });
  });

  // TODO(freben): The test timeouts are bumped in this file, because it seems
  // page and table rerenders accumulate to occasionally go over the default
  // limit. We should investigate why these timeouts happen.

  it('should render the default column of the grid', async () => {
    await renderWrapped(<DefaultCatalogPage />);

    const columnHeader = screen
      .getAllByRole('button')
      .filter(c => c.tagName === 'SPAN');
    const columnHeaderLabels = columnHeader.map(c => c.textContent);

    expect(columnHeaderLabels).toEqual([
      'Name',
      'System',
      'Owner',
      'Type',
      'Lifecycle',
      'Description',
      'Tags',
      'Actions',
    ]);
  }, 20_000);

  it('should render the custom column passed as prop', async () => {
    const columns: TableColumn<CatalogTableRow>[] = [
      { title: 'Foo', field: 'entity.foo' },
      { title: 'Bar', field: 'entity.bar' },
      { title: 'Baz', field: 'entity.spec.lifecycle' },
    ];
    await renderWrapped(<DefaultCatalogPage columns={columns} />);

    const columnHeader = screen
      .getAllByRole('button')
      .filter(c => c.tagName === 'SPAN');
    const columnHeaderLabels = columnHeader.map(c => c.textContent);
    expect(columnHeaderLabels).toEqual(['Foo', 'Bar', 'Baz', 'Actions']);
  }, 20_000);

  it('should render the default actions of an item in the grid', async () => {
    await renderWrapped(<DefaultCatalogPage />);
    fireEvent.click(screen.getByTestId('user-picker-owned'));
    expect(await screen.findByText(/Owned \(1\)/)).toBeInTheDocument();
    expect(await screen.findByTitle(/View/)).toBeInTheDocument();
    expect(await screen.findByTitle(/Edit/)).toBeInTheDocument();
    expect(await screen.findByTitle(/Add to favorites/)).toBeInTheDocument();
  }, 20_000);

  it('should render the custom actions of an item passed as prop', async () => {
    const actions: TableProps<CatalogTableRow>['actions'] = [
      () => {
        return {
          icon: () => <DashboardIcon fontSize="small" />,
          tooltip: 'Foo Action',
          disabled: false,
          onClick: () => jest.fn(),
        };
      },
      () => {
        return {
          icon: () => <DashboardIcon fontSize="small" />,
          tooltip: 'Bar Action',
          disabled: true,
          onClick: () => jest.fn(),
        };
      },
    ];

    await renderWrapped(<DefaultCatalogPage actions={actions} />);
    fireEvent.click(screen.getByTestId('user-picker-owned'));
    expect(await screen.findByText(/Owned \(1\)/)).toBeInTheDocument();
    expect(await screen.findByTitle(/Foo Action/)).toBeInTheDocument();
    expect(await screen.findByTitle(/Bar Action/)).toBeInTheDocument();
    expect((await screen.findByTitle(/Bar Action/)).firstChild).toBeDisabled();
  }, 20_000);

  // this test right now causes some red lines in the log output when running tests
  // related to some theme issues in mui-table
  // https://github.com/mbrn/material-table/issues/1293
  it('should render', async () => {
    await renderWrapped(<DefaultCatalogPage />);
    fireEvent.click(screen.getByTestId('user-picker-owned'));
    await expect(screen.findByText(/Owned \(1\)/)).resolves.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('user-picker-all'));
    await expect(screen.findByText(/All \(2\)/)).resolves.toBeInTheDocument();
  }, 20_000);

  it('should set initial filter correctly', async () => {
    await renderWrapped(<DefaultCatalogPage initiallySelectedFilter="all" />);
    await expect(screen.findByText(/All \(2\)/)).resolves.toBeInTheDocument();
  }, 20_000);

  // this test is for fixing the bug after favoriting an entity, the matching
  // entities defaulting to "owned" filter and not based on the selected filter
  it('should render the correct entities filtered on the selected filter', async () => {
    await renderWrapped(<DefaultCatalogPage />);

    fireEvent.click(screen.getByTestId('user-picker-owned'));
    await waitFor(() => screen.getByText(/Owned \(1\)/));
    // The "Starred" menu option should initially be disabled, since there
    // aren't any starred entities.
    await expect(screen.getByTestId('user-picker-starred')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByTestId('user-picker-all'));
    await expect(screen.findByText(/All \(2\)/)).resolves.toBeInTheDocument();

    const starredIcons = await screen.findAllByTitle('Add to favorites');
    fireEvent.click(starredIcons[0]);
    await expect(screen.findByText(/All \(2\)/)).resolves.toBeInTheDocument();

    // Now that we've starred an entity, the "Starred" menu option should be
    // enabled.
    await expect(screen.getByTestId('user-picker-starred')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    fireEvent.click(screen.getByTestId('user-picker-starred'));
    await expect(
      screen.findByText(/Starred \(1\)/),
    ).resolves.toBeInTheDocument();
  }, 20_000);

  it('should wrap filter in drawer on smaller screens', async () => {
    mockBreakpoint({ matches: true });
    await renderWrapped(<DefaultCatalogPage />);
    const button = screen.getByRole('button', { name: 'Filters' });
    expect(
      screen.getByRole('presentation', { hidden: true }),
    ).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole('presentation')).toBeVisible();
  }, 20_000);
});
